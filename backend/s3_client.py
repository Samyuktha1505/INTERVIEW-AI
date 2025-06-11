import boto3
import os
import uuid
from datetime import datetime
from pathlib import Path
from fastapi import HTTPException
from dotenv import load_dotenv 

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

class S3Client:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_REGION')
        )
        self.bucket = os.getenv('AWS_BUCKET_NAME')

    def get_resume_from_s3(self, user_email: str) -> str:
        """Get the latest resume text for a user from S3"""
        try:
            # List all resumes for the user
            res = self.s3.list_objects_v2(
                Bucket=self.bucket,
                Prefix=f"users/{user_email}/resumes/"
            )
            
            if not res.get('Contents'):
                raise HTTPException(status_code=404, detail="No resume found for this user")
            
            # Get the most recent resume
            latest_resume = max(res['Contents'], key=lambda x: x['LastModified'])
            
            # Get the resume content
            obj = self.s3.get_object(Bucket=self.bucket, Key=latest_resume['Key'])
            return obj['Body'].read().decode('utf-8')
            
        except Exception as e:
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to retrieve resume from S3: {str(e)}"
            )

    def upload_resume(self, user_id: str, file_bytes: bytes, content_type: str = 'application/pdf') -> dict:
        """Upload resume to S3 with metadata"""
        try:
            resume_id = f"resume_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
            s3_key = f"users/{user_id}/resumes/{resume_id}.pdf"
            
            self.s3.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=file_bytes,
                ContentType=content_type,
                Metadata={
                    'user_id': user_id,
                    'resume_id': resume_id,
                    'upload_date': datetime.now().isoformat()
                }
            )
            
            return {
                's3_key': s3_key,
                'resume_id': resume_id,
                'url': f"https://{self.bucket}.s3.amazonaws.com/{s3_key}"
            }
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"S3 Upload Error: {str(e)}")

# Create an instance to import elsewhere
s3_client = S3Client()